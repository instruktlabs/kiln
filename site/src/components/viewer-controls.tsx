import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { Camera } from 'three/webgpu';
import { OrbitControls as ThreeOrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * three's own orbit controls and glTF loader. drei's versions come through three-stdlib, whose index reaches classic
 * renderer classes the WebGPU build does not have.
 */

/** Orbit controls as the canvas's default controls, drawing a frame whenever they move the camera. */
export function OrbitControls({
  autoRotate,
  autoRotateSpeed,
  dampingFactor,
}: {
  autoRotate: boolean;
  autoRotateSpeed: number;
  dampingFactor: number;
}) {
  const camera = useThree((state) => state.camera) as Camera;
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const controls = useMemo(() => new ThreeOrbitControls(camera), [camera]);
  useEffect(() => {
    controls.connect(canvas);
    controls.addEventListener('change', invalidate as () => void);
    set({ controls: controls as never });
    return () => {
      controls.removeEventListener('change', invalidate as () => void);
      controls.dispose();
      set({ controls: null });
    };
  }, [controls, canvas, invalidate, set]);
  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = dampingFactor;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = autoRotateSpeed;
  }, [controls, autoRotate, autoRotateSpeed, dampingFactor]);
  // Before the frame's render. Damping keeps moving the camera after the pointer stops, and each move asks for a frame.
  useFrame(() => controls.update(), -1);
  return null;
}

const withMeshopt = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/** The model at `url`, suspending while it loads; one load per URL until `clearModel`. */
export const useModel = (url: string) => useLoader(GLTFLoader, url, withMeshopt);

export const clearModel = (url: string) => useLoader.clear(GLTFLoader, url);
