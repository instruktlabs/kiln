import { ACESFilmicToneMapping, NeutralToneMapping, RenderPipeline, SRGBColorSpace } from 'three/webgpu';
import type { Camera, Node, Scene, WebGPURenderer } from 'three/webgpu';
import { builtinAOContext, cdl, emissive, float, mrt, normalView, output, pass, renderOutput, screenUV, smoothstep, vec3, vec4, velocity } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { ssaaPass } from 'three/addons/tsl/display/SSAAPassNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { FARM_AO, FARM_BLOOM, FARM_GRADE, FARM_VIGNETTE, type FarmLookOptions } from './options';

export interface FarmPipeline { pipeline: RenderPipeline; samples: number; passes: string[]; render(): void; dispose(): void }
type Disposable = { dispose(): void };

/**
 * One three 0.186 `RenderPipeline` for a look option set (dev build only). Order: scene pass (with MRT outputs as
 * needed) → GTAO on indirect light through a normal/depth pre-pass → emissive-only bloom → TRAA or SMAA on linear
 * colour → tone mapping and sRGB (`renderOutput`) → grade → vignette → FXAA on display colour (it needs sRGB input).
 * MSAA stays the renderer's 4 samples inside the scene pass when `aa` is `msaa`; every other option renders the scene
 * pass without MSAA (TRAA requires it off; the post-process AA options replace it).
 */
export function buildFarmPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera, look: FarmLookOptions): FarmPipeline {
  const owned: Disposable[] = [], passes: string[] = [];
  const samples = look.aa === 'msaa' ? renderer.samples : 0;
  const scenePass = look.aa === 'ssaa' ? Object.assign(ssaaPass(scene, camera), { sampleLevel: 2 }) : pass(scene, camera, { samples });
  owned.push(scenePass); passes.push(look.aa === 'ssaa' ? 'ssaa scene pass (4 jittered renders)' : `scene pass (${samples ? samples + 'x MSAA' : 'no MSAA'})`);
  const outputs: Record<string, Node> = { output };
  if (look.bloom) outputs.emissive = emissive;
  if (look.aa === 'traa') outputs.velocity = velocity;
  if (Object.keys(outputs).length > 1) scenePass.setMRT(mrt(outputs));
  if (look.ao) {
    const prePass = pass(scene, camera, { samples: 0 }); prePass.setMRT(mrt({ output: normalView }));
    const aoNode = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
    aoNode.resolutionScale = FARM_AO.resolutionScale; aoNode.radius.value = FARM_AO.radius; aoNode.samples.value = FARM_AO.samples;
    scenePass.contextNode = builtinAOContext(aoNode.getTextureNode().sample(screenUV).r);
    owned.push(prePass, aoNode); passes.push('normal and depth pre-pass', `GTAO at ${FARM_AO.resolutionScale} resolution on indirect light`);
  }
  let color: Node<'vec4'> = scenePass.getTextureNode('output');
  if (look.bloom) {
    const glow = bloom(scenePass.getTextureNode('emissive'), FARM_BLOOM.strength, FARM_BLOOM.radius, FARM_BLOOM.threshold);
    owned.push(glow); passes.push('bloom on the emissive output'); color = color.add(glow) as Node<'vec4'>;
  }
  if (look.aa === 'traa') { const node = traa(color, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera); owned.push(node); passes.push('TRAA'); color = node; }
  if (look.aa === 'smaa') { const node = smaa(color); owned.push(node); passes.push('SMAA 1x medium'); color = node as unknown as Node<'vec4'>; }
  let display: Node<'vec4'> = renderOutput(color, look.tone === 'neutral' ? NeutralToneMapping : ACESFilmicToneMapping, SRGBColorSpace);
  passes.push(`tone mapping ${look.tone === 'neutral' ? 'Neutral' : 'ACES Filmic'} and sRGB`);
  if (look.grading) {
    display = cdl(display, vec3(...FARM_GRADE.slope), vec3(...FARM_GRADE.offset), vec3(...FARM_GRADE.power), float(FARM_GRADE.saturation)); passes.push('grade');
  }
  if (look.vignette) {
    const falloff = float(1).sub(smoothstep(FARM_VIGNETTE.inner, FARM_VIGNETTE.outer, screenUV.sub(.5).length().mul(Math.SQRT2)).mul(FARM_VIGNETTE.strength));
    display = vec4(display.rgb.mul(falloff), display.a); passes.push('vignette');
  }
  if (look.aa === 'fxaa') { const node = fxaa(display); owned.push(node); passes.push('FXAA'); display = node as unknown as Node<'vec4'>; }
  const pipeline = new RenderPipeline(renderer, display);
  // renderOutput above already tone maps and converts; the pipeline must not do it twice.
  pipeline.outputColorTransform = false;
  let disposed = false;
  return {
    pipeline, samples, passes,
    render() { if (!disposed) pipeline.render(); },
    dispose() { if (disposed) return; disposed = true; pipeline.dispose(); for (const node of owned.reverse()) node.dispose(); },
  };
}
