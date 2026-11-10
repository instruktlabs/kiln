import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three/webgpu';
import { asWebGPU, detectBackend, useQuality, useSceneRootRef } from '@kiln-scenes/scene-kit';
import { createInteriorMask, interiorBounceWeight } from './interior-bounce';
import { buildInteriorAo, interiorAoBlend, interiorAoEnabled, INTERIOR_AO_STRENGTH } from './interior-ao-pipeline';
import { squareInteriorOccluders } from './world';

/** One render owner. Outside the cathedral and on lower tiers, use the original direct render. */
export function InteriorAo() {
  const renderer = asWebGPU(useThree(state => state.gl)), scene = useThree(state => state.scene), camera = useThree(state => state.camera);
  const quality = useQuality(), active = interiorAoEnabled(quality.tier, detectBackend(renderer, false).backend);
  const root = useSceneRootRef();
  const current = useRef<{ roots: typeof squareInteriorOccluders; mask: ReturnType<typeof createInteriorMask>; effect: ReturnType<typeof buildInteriorAo> } | null>(null);
  const blend = useRef(0), failed = useRef(false), cameraPosition = useRef(new Vector3());
  const release = () => { current.current?.effect.dispose(); current.current?.mask.dispose(); current.current = null; blend.current = 0; };
  useEffect(() => { failed.current = false; return release; }, [renderer, scene, camera, active, quality.tier]);
  useEffect(() => {
    const element = root.current;
    return () => { if (element) for (const key of ['aoActive', 'aoTier', 'aoBlend', 'aoStatus']) delete element.dataset[key]; };
  }, [root]);
  useFrame((_state, delta) => {
    const roots = squareInteriorOccluders;
    const diagnostics = root.current?.dataset;
    if (diagnostics) { diagnostics.aoActive = 'false'; diagnostics.aoTier = quality.tier; diagnostics.aoBlend = blend.current.toFixed(3); diagnostics.aoStatus = !active ? 'tier-or-backend' : failed.current ? 'failed' : !roots ? 'waiting-for-world' : 'outside'; }
    if (!active || failed.current || !roots) { release(); renderer.render(scene, camera); return; }
    if (current.current && current.current.roots !== roots) release();
    camera.getWorldPosition(cameraPosition.current);
    blend.current = interiorAoBlend(blend.current, interiorBounceWeight(cameraPosition.current), delta);
    if (blend.current <= .001) { renderer.render(scene, camera); return; }
    try {
      if (!current.current) {
        const mask = createInteriorMask();
        try { current.current = { roots, mask, effect: buildInteriorAo(renderer, scene, camera, mask.weight, roots, quality.tier) }; }
        catch (error) { mask.dispose(); throw error; }
      }
      current.current.effect.strength.value = INTERIOR_AO_STRENGTH * blend.current;
      current.current.effect.render();
      if (diagnostics) { diagnostics.aoActive = 'true'; diagnostics.aoBlend = blend.current.toFixed(3); diagnostics.aoStatus = 'rendered'; }
    } catch (error) {
      release(); failed.current = true;
      console.warn('Cathedral interior AO unavailable; retaining direct rendering.', error);
      renderer.render(scene, camera);
    }
  }, 1);
  return null;
}
