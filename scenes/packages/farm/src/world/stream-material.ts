// Sealed r33 stream-material.mjs; MIT, Copyright (c) 2026 Matthew Kissinger.
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, cameraViewMatrix, color, float, mix, mx_noise_float, normalWorldGeometry, positionWorld, reflect, smoothstep, vec2, vec3 } from 'three/tsl';
import { createTimeNode } from '@kiln-scenes/scene-kit/lifecycle';
import type { SceneClock } from '@kiln-scenes/scene-kit/lifecycle';

export function createStreamMaterial(sceneClock: SceneClock) {
  const material = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: .25, metalness: 0 });
  const depth = attribute('waterDepth', 'float').max(0), flow = attribute('waterFlow', 'vec2'), world = positionWorld.xz;
  const direction = flow.normalize(), across = vec2(direction.y.negate(), direction.x);
  const clock = createTimeNode(sceneClock, 'ambient', 6), phase = clock.div(6).add(mx_noise_float(vec3(world.x.mul(.03), 0, world.y.mul(.03))).mul(.5)).fract();
  const footprint = world.dFdx().length().max(world.dFdy().length()), detail = smoothstep(.08, .5, footprint).oneMinus();
  const layer = (ph: typeof phase) => {
    const weight = ph.mul(2).sub(1).abs().oneMinus(), sample = world.sub(flow.mul(ph.sub(.5).mul(6))), along = sample.dot(direction), side = sample.dot(across);
    const wave = along.mul(7.1).add(side.mul(1.7)), fine = along.mul(15).sub(side.mul(8));
    const gradient = direction.mul(wave.cos().mul(.065)).add(across.mul(fine.cos().mul(.035))).mul(weight);
    const streak = mx_noise_float(vec3(along.mul(.7), float(2.1), side.mul(6))).mul(.5).add(.5);
    return { gradient, streak: smoothstep(.65, .84, streak).mul(weight), crest: wave.sin().mul(.5).add(.5).pow(9).mul(weight) };
  };
  const a = layer(phase), b = layer(phase.add(.5).fract()), fade = smoothstep(.005, .10, depth), gradient = a.gradient.add(b.gradient).mul(detail).mul(fade), normal = normalWorldGeometry.sub(vec3(gradient.x, 0, gradient.y)).normalize();
  material.normalNode = normal.transformNormalByViewMatrix(cameraViewMatrix);
  const coverage = smoothstep(0, .025, depth), foam = a.streak.add(b.streak).mul(.16).add(a.crest.add(b.crest).mul(.065)).mul(detail).mul(fade);
  const view = cameraPosition.sub(positionWorld).normalize(), mu = view.dot(normal).abs().clamp(0, 1), fresnel = mu.oneMinus().pow(5).mul(.98).add(.02);
  const transmission = depth.mul(-2.1).div(mu.mul(mu).oneMinus().mul(-1 / (1.333 * 1.333)).add(1).sqrt()).exp();
  const opacity = transmission.mul(fresnel.oneMinus()).oneMinus().add(foam.mul(.25)).mul(coverage).clamp(0, .96);
  material.opacityNode = opacity;
  const body = mix(color('#739b88'), color('#327e80'), smoothstep(.025, .24, depth));
  material.colorNode = mix(body, color('#e0ecdc'), foam); material.roughnessNode = mix(float(.24), float(.52), foam);
  const ray = reflect(view.negate(), normal), sky = mix(color('#bdd8d7'), color('#79aac0'), ray.y.max(0).pow(.5));
  material.emissiveNode = sky.mul(fresnel).mul(.65).mul(coverage).mul(foam.oneMinus()).div(opacity.max(.05));
  material.name = 'Farm flowing stream v1'; return material;
}
