import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { REVISION } from 'three/webgpu';

// OD-10: the private three contract src/renderer/msaa-store.ts relies on, pinned as source snippets and their order in
// the build that `three/webgpu` resolves to (not three/src). A three upgrade that moves any of these fails here before
// the policy can encode a wrong load or store op. Line numbers are deliberately not pinned.
const BUILD = Bun.resolveSync('three/webgpu', import.meta.dir);
const SOURCE = readFileSync(BUILD, 'utf8');

/** One class member, from its one-tab-indented signature to its closing brace, searched after `anchor`. */
function member(src: string, anchor: string, signature: string): string {
  const from = src.indexOf(anchor); if (from < 0) return '';
  const start = src.indexOf(`\n\t${signature}`, from); if (start < 0) return '';
  const end = src.indexOf('\n\t}\n', start); return end < 0 ? '' : src.slice(start, end);
}
/** A whole class, up to the next top-level class. */
function classBody(src: string, anchor: string): string {
  const start = src.indexOf(anchor); if (start < 0) return '';
  const end = src.indexOf('\nclass ', start + 1); return src.slice(start, end < 0 ? undefined : end);
}
/** Snippets absent from `body` or out of the given order. */
function unordered(body: string, snippets: string[]): string[] {
  const bad: string[] = []; let at = -1;
  for (const snippet of snippets) { const i = body.indexOf(snippet, at + 1); if (i < 0) bad.push(snippet); else at = i; }
  return bad;
}
const RENDERER = 'class Renderer {', BACKEND = 'class WebGPUBackend extends Backend {';

function pinFailures(src: string): Record<string, string[]> {
  const frameBufferTarget = member(src, RENDERER, '_getFrameBufferTarget() {');
  const pins: Record<string, string[]> = {
    // The canvas target is created multisampled and flagged, and its store flags reset to true on every call.
    frameBufferTargetReset: unordered(frameBufferTarget, [
      'samples: this.samples',
      'frameBufferTarget.isPostProcessingRenderTarget = true;',
      'const outputRenderTarget = this.getOutputRenderTarget();',
      'frameBufferTarget.setSize(',
      'frameBufferTarget.storeMultisampledColorBuffer = outputRenderTarget !== null ? outputRenderTarget.storeMultisampledColorBuffer : true;',
      'frameBufferTarget.storeMultisampledDepthBuffer = outputRenderTarget !== null ? outputRenderTarget.storeMultisampledDepthBuffer : true;',
      'frameBufferTarget.storeMultisampledStencilBuffer = outputRenderTarget !== null ? outputRenderTarget.storeMultisampledStencilBuffer : true;',
      'return frameBufferTarget;',
    ]),
    // Reset, bind, the scene callback with the target, texture creation, the pass, output, the after callback.
    renderSceneOrder: unordered(member(src, RENDERER, '_renderScene( scene, camera, useFrameBufferTarget = true ) {'), [
      'const frameBufferTarget = useFrameBufferTarget ? this._getFrameBufferTarget() : null;',
      "const sceneRef = ( scene.isScene === true ) ? scene : _scene;",
      'this.setRenderTarget( renderTarget );',
      'sceneRef.onBeforeRender( this, scene, camera, renderTarget );',
      'this._textures.updateRenderTarget( renderTarget, activeMipmapLevel );',
      'this.backend.beginRender( renderContext );',
      'this.backend.finishRender( renderContext );',
      'this.setRenderTarget( outputRenderTarget, activeCubeFace, activeMipmapLevel );',
      'this._renderOutput( renderTarget );',
      'sceneRef.onAfterRender( this, scene, camera, renderTarget );',
    ]),
    // compileAsync runs the scene callback with the canvas target before creating its textures, with no pass.
    compileAsyncOrder: unordered(member(src, RENDERER, 'async compileAsync( scene, camera, targetScene = null'), [
      'const renderTarget = useFrameBufferTarget ? this._getFrameBufferTarget() : outputRenderTarget;',
      'sceneRef.onBeforeRender( this, scene, camera, renderTarget );',
      'this._textures.updateRenderTarget( renderTarget, activeMipmapLevel );',
    ]),
    // Every canvas render goes through the instance's render(), where the kit wraps it.
    renderEntry: unordered(member(src, RENDERER, 'render( scene, camera ) {'), ['this._renderScene( scene, camera );']),
    needsFrameBufferTarget: unordered(member(src, RENDERER, 'get needsFrameBufferTarget() {'), [
      'const useToneMapping = this.currentToneMapping !== NoToneMapping;',
      'const useColorSpace = this.currentColorSpace !== ColorManagement.workingColorSpace;',
      'return useToneMapping || useColorSpace;',
    ]),
    // Manual clears reach the canvas target, and the backend's clear always stores.
    clearPath: [
      ...unordered(member(src, RENDERER, 'clear( color = true, depth = true, stencil = true ) {'), ['const renderTarget = this._renderTarget || this._getFrameBufferTarget();', 'this.backend.clear( color, depth, stencil, renderContext );']),
      ...unordered(member(src, BACKEND, 'clear( color, depth, stencil, renderTargetContext = null ) {'), ['clearConfig.depthStoreOp = GPUStoreOp.Store;', 'depthStencilAttachment.depthStoreOp = GPUStoreOp.Store;']),
      ...(member(src, BACKEND, 'clear( color, depth, stencil, renderTargetContext = null ) {').includes('GPUStoreOp.Discard') ? ['backend clear discards'] : []),
    ],
    // An out-of-pass copy reads the canvas target; in a pass it uses the current context.
    rendererCopy: unordered(member(src, RENDERER, 'copyFramebufferToTexture( framebufferTexture, rectangle = null ) {'), [
      'let renderContext = this._currentRenderContext;',
      'renderTarget = this._renderTarget || this._getFrameBufferTarget();',
      'this.backend.copyFramebufferToTexture( framebufferTexture, renderContext, rectangle );',
    ]),
    // Discard comes only from the flags, and discard forces a clear load.
    discardFromFlags: unordered(member(src, BACKEND, 'beginRender( renderContext ) {'), [
      'const discardColor = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledColorBuffer === false;',
      'const discardDepth = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledDepthBuffer === false;',
      'const discardStencil = renderContext.sampleCount > 1 && renderTarget?.storeMultisampledStencilBuffer === false;',
      'if ( renderContext.clearColor || discardColor || clearExternalColor ) {',
      'colorAttachment.storeOp = GPUStoreOp.Discard;',
      'if ( renderContext.clearDepth || discardDepth ) {',
      'depthStencilAttachment.depthStoreOp = GPUStoreOp.Discard;',
      'if ( renderContext.clearStencil || discardStencil ) {',
      'depthStencilAttachment.stencilStoreOp = GPUStoreOp.Discard;',
    ]),
    // A mid-pass copy ends the pass and restarts the same descriptor with Load and an unchanged storeOp.
    copyRestartsWithLoad: [
      ...unordered(member(src, BACKEND, 'copyFramebufferToTexture( texture, renderContext, rectangle ) {'), [
        'if ( renderContextData.currentPass ) {',
        'renderContextData.currentPass.end();',
        'this._copyFramebufferToTexture( encoder, texture, sourceGPU, destinationGPU, rectangle );',
        'descriptor.colorAttachments[ i ].loadOp = GPULoadOp.Load;',
        'if ( renderContext.depth ) descriptor.depthStencilAttachment.depthLoadOp = GPULoadOp.Load;',
        'renderContextData.currentPass = encoder.beginRenderPass( descriptor );',
      ]),
      ...(/storeOp\s*=/i.test(member(src, BACKEND, 'copyFramebufferToTexture( texture, renderContext, rectangle ) {')) ? ['copy rewrites a storeOp'] : []),
    ],
    // Flags false at texture creation make the 4x attachments transient: RENDER_ATTACHMENT only, clear/discard only.
    transientRule: unordered(member(src, 'class WebGPUTextureUtils {', 'createTexture( texture, options = {} ) {'), [
      'const supportsTransientAttachments = GPUTextureUsage.TRANSIENT_ATTACHMENT !== undefined;',
      'renderTarget?.storeMultisampledDepthBuffer === false &&',
      'renderTarget?.storeMultisampledColorBuffer === false;',
      'usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TRANSIENT_ATTACHMENT;',
      'msaaTextureDescriptorGPU.usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TRANSIENT_ATTACHMENT;',
    ]),
    // Viewport depth, shared and mip textures copy through the renderer's public method, once per render.
    viewportTextureCopy: [
      ...unordered(classBody(src, 'class ViewportTextureNode extends TextureNode {'), [
        'this.updateBeforeType = NodeUpdateType.RENDER;',
        '\tupdateBefore( frame ) {',
        'renderer.copyFramebufferToTexture( framebufferTexture );',
      ]),
      ...['class ViewportDepthTextureNode extends ViewportTextureNode {', 'class ViewportSharedTextureNode extends ViewportTextureNode {'].filter(s => !src.includes(s)),
    ],
    // RenderPipeline draws its quad without tone mapping, so it never touches the canvas target.
    pipelineQuad: unordered(member(src, 'class RenderPipeline {', 'render() {'), [
      'renderer.toneMapping = NoToneMapping;',
      'renderer.outputColorSpace = ColorManagement.workingColorSpace;',
      'this._quadMesh.render( renderer );',
    ]),
    // A render into any other target is not output, so it needs no frame-buffer target (shadows, reflectors, passes).
    outputTarget: [
      ...unordered(member(src, RENDERER, 'get isOutputTarget() {'), ['return this._renderTarget === this._outputRenderTarget || this._renderTarget === null;']),
      ...unordered(member(src, RENDERER, 'get currentToneMapping() {'), ['return this.isOutputTarget ? this.toneMapping : NoToneMapping;']),
      ...unordered(member(src, RENDERER, 'get currentColorSpace() {'), ['return this.isOutputTarget ? this.outputColorSpace : ColorManagement.workingColorSpace;']),
    ],
    // The reflector clears and renders into its own target mid-pass, which the guards' target check leaves alone.
    reflectorOwnTarget: unordered(member(src, 'class ReflectorBaseNode extends Node {', 'updateBefore( frame ) {'), [
      'renderer.setRenderTarget( renderTarget );',
      'renderer.clear();',
      'renderer.render( scene, virtualCamera );',
      'renderer.setRenderTarget( currentRenderTarget );',
    ]),
    // Every trip relies on dispose: colour, MSAA and own depth textures are destroyed and the target forgotten, so three
    // recreates them from the flags at its next updateRenderTarget.
    disposeRecreates: [
      ...unordered(member(src, 'class Textures extends DataMap {', 'updateRenderTarget( renderTarget, activeMipmapLevel = 0 ) {'), [
        'depthTexture.renderTarget = renderTarget;',
        'renderTargetData.onDispose = () => {',
        'this._destroyRenderTarget( renderTarget );',
        "renderTarget.addEventListener( 'dispose', renderTargetData.onDispose );",
      ]),
      ...unordered(member(src, 'class Textures extends DataMap {', '_destroyRenderTarget( renderTarget ) {'), [
        'this._destroyTexture( textures[ i ] );',
        'if ( depthTexture && depthTexture.renderTarget === renderTarget ) {',
        'this._destroyTexture( depthTexture );',
        'this.delete( renderTarget );',
      ]),
      ...unordered(member(src, 'class WebGPUTextureUtils {', 'destroyTexture( texture, isDefaultTexture = false ) {'), [
        'if ( textureData.msaaTexture !== undefined ) textureData.msaaTexture.destroy();',
      ]),
    ],
  };
  // _getFrameBufferTarget is the only writer of isPostProcessingRenderTarget.
  const writers = [...src.matchAll(/\.isPostProcessingRenderTarget\s*=(?!=)/g)].map(m => m.index!);
  const start = src.indexOf(frameBufferTarget);
  pins.singleWriter = writers.length === 1 && frameBufferTarget && writers[0]! > start && writers[0]! < start + frameBufferTarget.length ? [] : [`${writers.length} writers`];
  return pins;
}
const clean = (pins: Record<string, string[]>) => Object.fromEntries(Object.entries(pins).filter(([, bad]) => bad.length));

describe('OD-10 three r186 contract for the MSAA store policy', () => {
  test('the build three/webgpu resolves to is r186', () => {
    expect(BUILD.replaceAll('\\', '/')).toEndWith('three/build/three.webgpu.js');
    expect(REVISION).toBe('186');
  });
  test('every pinned snippet is present and in order', () => {
    expect(clean(pinFailures(SOURCE))).toEqual({});
  });
  test('the pins notice a reorder, a changed reset, a second writer, a non-output getter and a dispose that keeps the target', () => {
    const body = member(SOURCE, RENDERER, '_renderScene( scene, camera, useFrameBufferTarget = true ) {');
    const hook = 'sceneRef.onBeforeRender( this, scene, camera, renderTarget );', begin = 'this.backend.beginRender( renderContext );';
    const swapped = SOURCE.replace(body, body.replace(hook, '').replace(begin, `${begin}\n\t\t${hook}`));
    expect(Object.keys(clean(pinFailures(swapped)))).toContain('renderSceneOrder');
    const reset = SOURCE.replace('outputRenderTarget.storeMultisampledDepthBuffer : true;', 'outputRenderTarget.storeMultisampledDepthBuffer : false;');
    expect(Object.keys(clean(pinFailures(reset)))).toEqual(['frameBufferTargetReset']);
    const writer = SOURCE.replace('class RenderPipeline {', 'class RenderPipeline {\n\tx() { this.target.isPostProcessingRenderTarget = true; }');
    expect(Object.keys(clean(pinFailures(writer)))).toEqual(['singleWriter']);
    const output = SOURCE.replace('return this.isOutputTarget ? this.toneMapping : NoToneMapping;', 'return this.toneMapping;');
    expect(Object.keys(clean(pinFailures(output)))).toEqual(['outputTarget']);
    const destroy = member(SOURCE, 'class Textures extends DataMap {', '_destroyRenderTarget( renderTarget ) {');
    const kept = SOURCE.replace(destroy, destroy.replace('this.delete( renderTarget );', ''));
    expect(Object.keys(clean(pinFailures(kept)))).toEqual(['disposeRecreates']);
  });
});
